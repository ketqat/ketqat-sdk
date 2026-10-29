from __future__ import annotations


def pytest_configure(config) -> None:
    config.addinivalue_line(
        "markers",
        "slow: installs packages into fresh virtualenvs; runs only with KETQAT_RUN_SLOW_TESTS=1",
    )
