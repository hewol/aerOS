#!/usr/bin/env bash

set -e

rerun=true
clean() {
    echo "Cleaning work directory"
    sudo umount -Rq work || true
    sudo rm -r work
}

if [ ! -f /etc/pacman.d/chaotic-mirrorlist ]; then
    echo -n "Chaotic AUR is not installed in your system. Do you want to install it? [Y/n] " && read install
        if [[ ${install:0:1} == "y" || ${install:0:1} == "" ]]; then
            echo "Installing chaotic aur"
            sudo pacman-key --recv-key 3056513887B78AEB --keyserver keyserver.ubuntu.com
            sudo pacman-key --lsign-key 3056513887B78AEB
            sudo pacman -U --noconfirm 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-keyring.pkg.tar.zst' 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-mirrorlist.pkg.tar.zst'
            if [ -f /etc/pacman.d/chaotic-mirrorlist ]; then
                echo "Successfully installed chaotic aur ... continuing with the build."
            else
                echo "Chaotic aur mirrorlist not found .. aborting build."
                rerun=false
            fi
        else
            echo "Chaotic aur mirrorlist not found .. aborting build."
            rerun=false
        fi
fi

while $rerun; do
    test -d work && clean
    # ! sudo mkarchiso -v archlive 2>&1 | tee debug.log
    ! sudo mkarchiso -v archlive
    retcod=${PIPESTATUS[0]}
    if [ $retcod == 0 ]; then
        rerun=false
    else
        echo
        # echo "Build failed with the following errors"
        # grep -i 'error\|warning\|failed' debug.log
        echo -n "Do you want to retry the build? [y/N] " && read retry
        if [[ ${retry:0:1} != "y" ]]; then
            rerun=false
        else
            echo
        fi
    fi
done

test -d work && clean
[[ $retcod == 0 ]] && echo "Building finished successfully." || echo "Building failed."
