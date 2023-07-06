# aerOS
### aerOS is our own Arch Linux Respin OS.
* Easy to use
* Super Fast
* Inculdes yay-AUR 
* Includes custom UI

You can help us make aerOS by emailing us at hewol@proton.me or join our Discord Server: https://discord.gg/haTmcAtKCP

![aerOS](https://hewol.github.io/assets/img/aeros-pic.png)

# Steps to build

Create a directory where the resulting files of `mkarchiso` will go eg: `mkdir ~/iso`.

- `git clone https://github.com/hewol/aerOS`
- `cd aerOS`
- `sudo mkarchiso -v -w ~/iso/aerOS/ -o ~/iso archlive`

**NOTE**: Make sure *chaotic-mirrorlist* is present in */ect/pacman.d/*

**NOTE**: Make sure to clean the *isodir* directory before rebuilding `yes | rm -r isodir/aerOS*`.

## Other aerOS info/repositories

### Maintain Policy List: https://github.com/hewol/aerOS/blob/main/MAINTAIN.md
### aerOS wallpapers repo: https://github.com/hewol/aeros-wallpapers
### aerOS calamares config repo: https://github.com/hewol/aeros-calamares

