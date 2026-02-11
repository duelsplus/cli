# Duels+ CLI
A lightweight CLI launcher for running the Duels+ proxy. Alternative to the [GUI launcher](https://duelsplus.com/download).

> um its like the window code pops out of mauybe -Navi

## Installation
Download the latest release for your target (os/arch) from the [releases](https://github.com/duelsplus/cli/releases) page.

## Usage
You can launch the proxy simply by running `duelsplus`. To learn more about the commands included, enter `help` in the interactive command prompt, or run `duelsplus --help`.

## Development
Ensure you have [Bun](https://bun.sh/) installed.

### Clone & install dependencies
```bash
git clone https://github.com/duelsplus/cli.git
cd cli
bun install
```

### Run the CLI
```bash
bun start
```

or

```bash
bun --hot run src/index.ts
```

## Contributing
See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License
Licensed under the **MIT License**.  
See [LICENSE](./LICENSE).
