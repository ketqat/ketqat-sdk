# KetQat

[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/KcJcRJv6pr)
[![X](https://img.shields.io/badge/X-Follow%20Us-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/ketqat)

**The Home for Quantum Computing**

KetQat is an open-source platform for connecting with quantum cloud providers, sharing algorithms, and collaborating on quantum computing research. Whether you're a researcher, developer, or quantum computing enthusiast, KetQat provides a centralized hub for discovering quantum resources, running algorithms, and collaborating on the future of quantum technology.

## About

KetQat serves as a community-driven platform that bridges the gap between quantum computing research and practical implementation. The platform enables researchers and developers to:

- **Connect to Quantum Clouds**: Seamlessly connect to major quantum cloud providers including IBM Quantum, AWS Braket, IonQ, Quantinuum, and many others
- **Share Algorithms**: Upload and share your quantum algorithms and research with the global quantum computing community
- **Discover Resources**: Browse a curated collection of quantum computing resources, tools, and datasets contributed by researchers worldwide
- **Collaborate**: Engage with the open-source quantum computing community through contributions, discussions, and partnerships

## Features

### ☁️ Quantum Cloud Hub

Connect and manage access to quantum cloud providers in one place. KetQat supports integration with:

- **IBM Quantum** - Access IBM's utility-scale superconducting quantum computers
- **Amazon Braket** - Unified interface to multiple quantum hardware providers
- **IonQ Cloud** - High-fidelity trapped-ion quantum computers
- **Quantinuum Nexus** - H-Series trapped-ion quantum backends
- **D-Wave Leap** - Quantum annealing processors
- And many more providers...

### 🎨 Modern UI

Built with Next.js 14, TypeScript, and Tailwind CSS for a responsive, intuitive experience. The platform features a clean, modern interface that makes it easy to manage cloud connections and contribute to the community.

## Tech Stack

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Deployment**: Cloudflare Pages
- **UI Components**: Radix UI, Lucide React
- **State Management**: React Hooks

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ketqat/ketqat.git
cd ketqat
```

2. Install dependencies:
```bash
npm install --legacy-peer-deps
```

### Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3042`.

### Build

Build the application for production:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

## Contributing

We encourage you to fork this repository and contribute to the open-source project. Your contributions, whether they're bug fixes, new features, documentation improvements, or feedback, are welcome and valued. Together, we can make KetQat better for the entire quantum computing community.

Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to get started.

## API

KetQat exposes a simple REST API for accessing provider data:

```bash
# Get all quantum providers
GET /api/providers
```

Returns a JSON object with:
- `providers`: Array of provider objects
- `count`: Total number of providers
- `timestamp`: ISO timestamp of the response

## Roadmap

### 🔬 Decoder Zoo (Planned)

We're planning to add a Decoder Zoo feature that will allow you to browse and discover Quantum Error Correction decoders from the community. This feature will include:

- Search by code type (surface code, color code, stabilizer, bosonic)
- Filter by qubit type (superconducting, trapped-ion, photonic, neutral-atom)
- Detailed documentation and usage examples for each decoder
- Community ratings and reviews

This feature is currently under development. Stay tuned for updates!

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
