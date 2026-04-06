
export interface QuantumProvider {
    id: string;
    name: string;
    url: string;
    description: string;
    category: "Hardware" | "Software" | "Cloud";
    tags: string[];
    status: "operational" | "degraded" | "maintenance";
    pricing: "Free Tier" | "Paid" | "Contact";
}

export const QUANTUM_PROVIDERS: QuantumProvider[] = [
    {
        id: "ibm-quantum",
        name: "IBM Quantum",
        url: "https://quantum.cloud.ibm.com/",
        description: "Access IBM's utility-scale superconducting quantum computers and Qiskit Runtime services directly.",
        category: "Hardware",
        tags: ["Superconducting", "100+ Qubits", "Qiskit"],
        status: "operational",
        pricing: "Free Tier",
    },
    {
        id: "aws-braket",
        name: "Amazon Braket",
        url: "https://us-east-1.console.aws.amazon.com/braket/",
        description: "A fully managed service that provides access to different types of quantum hardware (IonQ, Rigetti, QuEra) through a single interface.",
        category: "Cloud",
        tags: ["Multi-Provider", "AWS Integration", "Managed"],
        status: "operational",
        pricing: "Paid",
    },
    {
        id: "iqm-resonance",
        name: "IQM Resonance",
        url: "https://resonance.meetiqm.com/",
        description: "Access IQM's superconducting quantum computers and simulators directly through the Resonance cloud platform.",
        category: "Hardware",
        tags: ["Superconducting", "European"],
        status: "operational",
        pricing: "Contact",
    },
    {
        id: "dwave-leap",
        name: "D-Wave Leap",
        url: "https://cloud.dwavesys.com/leap/login",
        description: "Real-time access to D-Wave's quantum annealing processors and hybrid solvers for optimization problems.",
        category: "Hardware",
        tags: ["Annealing", "Optimization", "Hybrid"],
        status: "operational",
        pricing: "Free Tier",
    },
    {
        id: "ionq-cloud",
        name: "IonQ Cloud",
        url: "https://cloud.ionq.com/jobs",
        description: "Run circuits on high-fidelity trapped-ion quantum computers via the IonQ Cloud portal.",
        category: "Hardware",
        tags: ["Trapped Ion", "High Fidelity", "Glass"],
        status: "operational",
        pricing: "Paid",
    },
    {
        id: "quantinuum-nexus",
        name: "Quantinuum Nexus",
        url: "https://nexus.quantinuum.com/",
        description: "A comprehensive platform for managing and executing experiments on H-Series trapped-ion quantum backend.",
        category: "Hardware",
        tags: ["Trapped Ion", "H-Series", "High Fidelity"],
        status: "operational",
        pricing: "Paid",
    },
    {
        id: "pasqal-cloud",
        name: "Pasqal Cloud",
        url: "https://portal.pasqal.cloud/dashboard",
        description: "Control neutral atom quantum processors for simulation and optimization tasks via Pasqal's interface.",
        category: "Hardware",
        tags: ["Neutral Atom", "Simulation"],
        status: "operational",
        pricing: "Contact",
    },
    {
        id: "quandela-cloud",
        name: "Quandela Cloud",
        url: "https://cloud.quandela.com/webide/",
        description: "Photonic quantum computing cloud platform featuring Perceval for optical quantum simulation and execution.",
        category: "Hardware",
        tags: ["Photonic", "Perceval", "Optical"],
        status: "operational",
        pricing: "Free Tier",
    },
    {
        id: "classiq-platform",
        name: "Classiq Platform",
        url: "https://platform.classiq.io/",
        description: "A high-level synthesis engine that automatically generates optimized quantum circuits from functional models.",
        category: "Software",
        tags: ["Circuit Synthesis", "Python SDK"],
        status: "operational",
        pricing: "Free Tier",
    },
    {
        id: "bluequbit",
        name: "BlueQubit",
        url: "https://app.bluequbit.io/",
        description: "High-performance quantum simulators enabling fast execution of complex quantum circuits on CPU/GPU clusters.",
        category: "Software",
        tags: ["Simulator", "GPU", "Fast"],
        status: "operational",
        pricing: "Free Tier",
    },
    {
        id: "quantum-rings",
        name: "Quantum Rings",
        url: "https://portal.quantumrings.com/",
        description: "Advanced quantum simulation platform designed to run large-scale quantum algorithms on classical hardware.",
        category: "Software",
        tags: ["Simulator", "Large-Scale"],
        status: "operational",
        pricing: "Free Tier",
    },
    {
        id: "q-ctrl-black",
        name: "Q-CTRL Black",
        url: "https://black.q-ctrl.com/welcome",
        description: "Infrastructure software to improve quantum hardware performance through advanced control and error suppression.",
        category: "Software",
        tags: ["Control Software", "Error Suppression"],
        status: "operational",
        pricing: "Contact",
    },
    {
        id: "riverlane-deltakit",
        name: "Riverlane Deltakit",
        url: "https://deltakit.riverlane.com/",
        description: "Tools for quantum error correction, enabling the development and testing of fault-tolerant quantum architectures.",
        category: "Software",
        tags: ["QEC Tools", "Fault-Tolerant"],
        status: "operational",
        pricing: "Contact",
    },
    {
        id: "entropica-labs-loom",
        name: "Entropica Labs Loom",
        url: "https://loom-docs.entropicalabs.com/",
        description: "Development tools and middleware for designing and running algorithms on fault-tolerant quantum computers.",
        category: "Software",
        tags: ["Middleware", "Fault-Tolerant"],
        status: "operational",
        pricing: "Contact",
    },
    {
        id: "qbraid",
        name: "qBraid",
        url: "https://account.qbraid.com/",
        description: "A comprehensive cloud platform for developing, running, and deploying quantum jobs across various hardware providers using a unified interface.",
        category: "Cloud",
        tags: ["Multi-Provider", "Unified Interface", "Python"],
        status: "operational",
        pricing: "Free Tier",
    },
];

export function getProviderById(id: string): QuantumProvider | undefined {
    return QUANTUM_PROVIDERS.find((provider) => provider.id === id);
}

export function getRelatedProviders(provider: QuantumProvider, limit: number = 4): QuantumProvider[] {
    return QUANTUM_PROVIDERS
        .filter((p) => p.id !== provider.id && p.category === provider.category)
        .slice(0, limit);
}
