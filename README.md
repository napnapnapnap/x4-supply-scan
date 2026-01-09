# X4 Vault Finder

This is a visualisation toolchain for X4 save files. It shows a 3D plot for every sector in the browser.

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

<img width="1697" height="818" alt="Screenshot_20251020_134915" src="https://github.com/user-attachments/assets/a0e41689-0966-44d3-b2fe-20125d3d3790" />

## How to run

1. Clone this repository or download it as a zip file and extract it locally
2. On your local machine open a shell in this directory
3. Pipe your savefile into the x4-vault-finder.py script
    * Windows (use cmd.exe, not powershell):
        * `python x4-vault-finder.py < "%USERPROFILE%\Documents\Egosoft\X4\<user-id>\save\<name>.xml.gz"`
    * Linux:
        * `python3 x4-vault-finder.py < "$HOME/.config/EgoSoft/X4/<user-id>/save/<name>.xml.gz"`
4. When the script finishes, a browser window will open
5. Click a sector on the left to show its 3D plot


## Technical details

* The savefile is not modified
* You only need python and a browser, no external dependencies
* The python script uses little memory by streaming the savefile in a single pass and keeping only relevant data
* When a new DLC is released, the x4-data-extractor.py script needs to be run again. The current DLC is Envoy.
* Thanks to the [X4-Info-Miner](https://github.com/TuxInvader/X4-Info-Miner) project for developing the inspirational x4-cat-miner.py script
