#!/usr/bin/env python3
"""Publish the native worker pair; never change functions, aliases or Batch IAM."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


class ReleaseError(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise ReleaseError(message)


class Publisher:
    def __init__(self, env=None):
        self.env = dict(os.environ if env is None else env)
        self.account = self.env.get('AWS_ACCOUNT_ID', '')
        self.environment = self.env.get('DEPLOYMENT_ENV', '')
        self.revision = self.env.get('RELEASE_ID', '')
        require(re.fullmatch(r'[0-9]{12}', self.account), 'Invalid account')
        require(self.environment in ['staging', 'production'], 'Invalid environment')
        require(re.fullmatch(r'[a-f0-9]{40}', self.revision), 'Invalid source revision')
        require(self.env.get('AWS_REGION') == 'ap-northeast-1', 'Use Tokyo')
        self.registry = f'{self.account}.dkr.ecr.ap-northeast-1.amazonaws.com'
        self.repository = f'ketqat-{self.environment}/worker'
        self.prefix = f'{self.registry}/{self.repository}'
        require(self.env.get('ECR_PREFIX') == f'{self.registry}/ketqat-{self.environment}', 'Wrong repository prefix')
        self.stage_definition = self.env.get('STAGING_BATCH_JOB_DEFINITION_ARN', '')
        if self.environment == 'production':
            require(re.fullmatch(fr'arn:aws:batch:ap-northeast-1:{self.account}:job-definition/ketqat-staging-worker:[1-9][0-9]*', self.stage_definition), 'Require numbered staging Batch definition')
        self.reports = Path('release')

    def command(self, args, input_text=None, check=True):
        result = subprocess.run(args, env=self.env, input=input_text, text=True, capture_output=True, timeout=3600)
        if check and result.returncode:
            # AWS/HTTP errors and registry credentials are never copied to logs.
            raise ReleaseError(f'{args[0]} {args[1]} failed; inspect the service with the scoped operator role')
        return result

    def aws(self, *args):
        return json.loads(self.command(['aws', *args, '--region', 'ap-northeast-1', '--output', 'json']).stdout)

    def digest(self, repository, target, optional=False):
        result = self.command(['aws', 'ecr', 'describe-images', '--repository-name', repository,
                               '--image-ids', f'imageTag={self.revision}-{target}', '--region', 'ap-northeast-1', '--output', 'json'], check=False)
        if result.returncode:
            if optional and 'ImageNotFoundException' in result.stderr and 'AccessDenied' not in result.stderr:
                return None
            raise ReleaseError('ECR lookup failed; absence is unproven')
        details = json.loads(result.stdout)['imageDetails']
        require(len(details) == 1, 'Require exactly one immutable image')
        value = details[0]['imageDigest']
        require(re.fullmatch(r'sha256:[a-f0-9]{64}', value), 'Invalid image digest')
        return value

    def staging_pair(self):
        pair = {target: self.digest('ketqat-staging/worker', target) for target in ['lambda', 'batch']}
        function = self.aws('lambda', 'get-function', '--function-name', 'ketqat-staging-worker', '--qualifier', 'live')
        config = function['Configuration']
        require(function['Code']['ResolvedImageUri'] == f'{self.registry}/ketqat-staging/worker@{pair["lambda"]}', 'Staging live Lambda uses another image')
        require(config['FunctionName'] == 'ketqat-staging-worker' and re.fullmatch(r'[1-9][0-9]*', config['Version']), 'Staging must use a published version')
        require(config['State'] == 'Active' and config['LastUpdateStatus'] == 'Successful' and config['Architectures'] == ['arm64'], 'Staging Lambda is not ready')
        alias = self.aws('lambda', 'get-alias', '--function-name', 'ketqat-staging-worker', '--name', 'live')
        require(alias['FunctionVersion'] == config['Version'] and not alias.get('RoutingConfig', {}).get('AdditionalVersionWeights'), 'Staging alias is weighted or changed')
        definitions = self.aws('batch', 'describe-job-definitions', '--job-definitions', self.stage_definition)['jobDefinitions']
        require(len(definitions) == 1, 'Require exact staging Batch definition')
        definition = definitions[0]
        require(definition['jobDefinitionArn'] == self.stage_definition and definition['status'] == 'ACTIVE', 'Staging Batch revision is not active')
        properties = definition['containerProperties']
        require(properties['image'] == f'{self.registry}/ketqat-staging/worker@{pair["batch"]}', 'Staging Batch uses another image')
        require(definition['platformCapabilities'] == ['FARGATE'] and properties['runtimePlatform']['cpuArchitecture'] == 'ARM64', 'Staging Batch is not ARM64 Fargate')
        # This binds promotion to deployed artifacts, not to successful live
        # scientific/callback/rollback acceptance. Those remain readiness gates.
        return pair, {'lambdaVersion': config['Version'], 'aliasRevision': alias['RevisionId'], 'batchDefinition': self.stage_definition}

    def inspect(self, image, target):
        data = json.loads(self.command(['docker', 'image', 'inspect', image]).stdout)[0]
        require(data['Architecture'] == 'arm64' and data['Os'] == 'linux', 'Wrong image platform')
        config = data['Config']
        require(config['User'] == '10001:10001', 'Wrong runtime user')
        require(config['Labels'].get('org.opencontainers.image.revision') == self.revision, 'Wrong source revision')
        if target == 'lambda':
            require(config['Entrypoint'] == ['/lambda-entrypoint.sh'] and config['Cmd'] == ['worker/lambda/handler.handler'], 'Wrong Lambda entrypoint')
        else:
            require(config['Entrypoint'] == ['/var/lang/bin/node', '--disallow-code-generation-from-strings', '/var/task/worker/lambda/batch.mjs'] and not config['Cmd'], 'Wrong Batch entrypoint')
        return data['RootFS']['Layers']

    def publish(self):
        identity = self.aws('sts', 'get-caller-identity')
        require(identity['Account'] == self.account and identity['Arn'].startswith(f'arn:aws:sts::{self.account}:assumed-role/ketqat-{self.environment}-github-sdk/'), 'Require the scoped SDK release role')
        existing = {target: self.digest(self.repository, target, optional=True) for target in ['lambda', 'batch']}
        stage, proof = self.staging_pair() if self.environment == 'production' else ({}, {})
        for target, digest in existing.items():
            if self.environment == 'production' and digest:
                require(digest == stage[target], 'Existing production tag differs from staging')
        self.reports.mkdir(exist_ok=True)
        images = {}
        layers = {}
        for target in ['lambda', 'batch']:
            tag = f'{self.prefix}:{self.revision}-{target}'
            if existing[target]:
                image = f'{self.prefix}@{existing[target]}'
                self.command(['docker', 'pull', image])
            elif self.environment == 'production':
                image = tag
                source = f'{self.registry}/ketqat-staging/worker@{stage[target]}'
                self.command(['docker', 'pull', source])
                self.command(['docker', 'tag', source, tag])
            else:
                image = tag
                self.command(['docker', 'build', '--platform', 'linux/arm64', '--provenance=false', '--target', target,
                              '--build-arg', f'KETQAT_OS_REFRESH={self.revision}', '--label', f'org.opencontainers.image.revision={self.revision}',
                              '-f', 'worker/Dockerfile', '-t', tag, '.'])
            images[target] = image
            layers[target] = self.inspect(image, target)
        require(layers['lambda'] and layers['lambda'] == layers['batch'], 'Worker filesystem layers differ; refuse mixed releases')
        # Verify and scan BOTH targets before pushing either target.
        for target, image in images.items():
            probe = f'verify-{target}-worker-container.mjs'
            self.command(['docker', 'run', '--rm', '--read-only', '--network', 'none', '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m',
                          '-v', f'{Path.cwd()}/scripts/{probe}:/{probe}:ro', '--entrypoint', '/var/lang/bin/node', image, f'/{probe}'])
            self.command(['docker', 'run', '--rm', '-v', '/var/run/docker.sock:/var/run/docker.sock', '-v', f'{self.reports.resolve()}:/reports',
                          'aquasec/trivy:0.74.0', 'image', '--scanners', 'vuln', '--exit-code', '1', '--severity', 'HIGH,CRITICAL',
                          '--format', 'json', '--output', f'/reports/{target}-vulnerabilities.json', image])
        published = {}
        for target, image in images.items():
            if not existing[target]:
                self.command(['docker', 'push', image])
            digest = self.digest(self.repository, target)
            if self.environment == 'production':
                require(digest == stage[target], 'Promotion changed the tested digest')
            elif existing[target]:
                require(digest == existing[target], 'Immutable tag changed')
            self.command(['aws', 'ecr', 'wait', 'image-scan-complete', '--repository-name', self.repository,
                          '--image-id', f'imageDigest={digest}', '--region', 'ap-northeast-1'])
            scan = self.aws('ecr', 'describe-image-scan-findings', '--repository-name', self.repository, '--image-id', f'imageDigest={digest}')
            (self.reports / f'{target}-ecr-scan.json').write_text(json.dumps(scan))
            require(scan['imageScanStatus']['status'] == 'COMPLETE', 'ECR scan incomplete')
            counts = scan['imageScanFindings'].get('findingSeverityCounts', {})
            require(not any(counts.get(s, 0) for s in ['HIGH', 'CRITICAL']), 'ECR High/Critical release gate failed')
            published[target] = f'{self.prefix}@{digest}'
        if self.environment == 'production':
            require(self.staging_pair() == (stage, proof), 'Staging changed during promotion')
        # A manifest exists only after all gates pass. Partial uploads are
        # harmless immutable artifacts, never an instruction to deploy.
        manifest = {'sourceSha': self.revision, 'environment': self.environment, 'images': published, 'staging': proof}
        (self.reports / 'worker-images.json').write_text(json.dumps(manifest, indent=2) + '\n')

    def run(self):
        self.reports.mkdir(exist_ok=True)
        (self.reports / 'worker-images.json').unlink(missing_ok=True)
        old_config = Path(self.env.get('DOCKER_CONFIG', str(Path.home() / '.docker'))) / 'config.json'
        old = json.loads(old_config.read_text()) if old_config.exists() else {}
        with tempfile.TemporaryDirectory(prefix='ketqat-worker-registry-') as directory:
            config = Path(directory) / 'config.json'
            config.write_text(json.dumps({key: old[key] for key in ['cliPluginsExtraDirs'] if key in old}))
            config.chmod(0o600)
            self.env['DOCKER_CONFIG'] = directory
            try:
                password = self.command(['aws', 'ecr', 'get-login-password', '--region', 'ap-northeast-1']).stdout
                self.command(['docker', 'login', '--username', 'AWS', '--password-stdin', self.registry], input_text=password)
                self.publish()
            finally:
                self.command(['docker', 'logout', self.registry], check=False)


if __name__ == '__main__':
    try:
        Path('release/worker-images.json').unlink(missing_ok=True)
        Publisher().run()
    except ReleaseError as error:
        print(f'Worker image publication refused: {error}. No release manifest is authorized.', flush=True)
        raise SystemExit(1)
    except (KeyError, ValueError, subprocess.TimeoutExpired):
        print('Worker image publication failed; no release manifest is authorized. Inspect the scoped operator evidence.', flush=True)
        raise SystemExit(1)
