# X4 Vault Finder

A browser-based visualisation tool for X4 save files. Upload your save file and explore a 3D plot of every sector.

**[Open X4 Vault Finder](https://fabian-flechtmann.github.io/x4-vault-finder)**

It uses colors for different objects:

* Vaults
   * Blue for collectable blueprints (This shows the Erlking vaults)
   * Purple for collectable wares
   * Pink for signal leaks
   * Brown for empty
* Stations
   * Red for Khaak
   * Green for Player
   * Silver for all others
* Yellow for abandoned ships
* A silver ring for gates (clickable to navigate there)

<img width="1338" height="831" alt="Screenshot_20260110_102427" src="https://github.com/user-attachments/assets/a649a461-bec4-4771-902d-7196f07656fe" />

## How to use

1. Open the application hosted on Github Pages or run a local webserver
2. Click "Select Save" and select your save file
   * Windows: `%USERPROFILE%\Documents\Egosoft\X4\<user-id>\save\<name>.xml.gz`
   * Linux: `~/.config/EgoSoft/X4/<user-id>/save/<name>.xml.gz`
3. Wait for the file to be parsed
4. Click a sector on the left to show its 3D plot

## Technical details

* Everything runs in your browser - the save file is never uploaded to any server
* Works with gzipped (.gz) or uncompressed (.xml) save files
* When a new DLC is released, the x4-data-extractor.py script needs to be run again. The current DLC is Envoy.
* Thanks to the [X4-Info-Miner](https://github.com/TuxInvader/X4-Info-Miner) project for developing the inspirational x4-cat-miner.py script
