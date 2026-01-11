# X4 Vault Finder

Visualize your X4 save file in 3D. Find vaults, abandoned ships, and stations across all sectors.

**[Open X4 Vault Finder](https://fabian-flechtmann.github.io/x4-vault-finder)**

<img width="1338" height="831" alt="Screenshot" src="https://github.com/user-attachments/assets/a649a461-bec4-4771-902d-7196f07656fe" />

## Color Legend

| Object | Color |
|--------|-------|
| Vault (blueprints) | Blue |
| Vault (wares) | Purple |
| Vault (signal leak) | Pink |
| Vault (empty) | Brown |
| Station (Khaak) | Red |
| Station (Player) | Green |
| Station (other) | Silver |
| Abandoned ship | Yellow |
| Gate | Silver ring (click to jump) |

## Usage

1. Open the app and click "Select Save"
2. Pick your save file (.gz or .xml)
3. Select a sector to view its 3D plot

## Notes

- Runs entirely in your browser. Your save file stays local.
- Save files are not modified.
- After a new DLC release, run `x4-data-extractor.py` to update game data. Current: Envoy.
- Inspired by [X4-Info-Miner](https://github.com/TuxInvader/X4-Info-Miner).
