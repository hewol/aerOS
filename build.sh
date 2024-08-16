#!/bin/bash
set -e

clean() {
    echo "Cleaning work directory"
    sudo umount -Rq work
    sudo rm -rf work || echo "ALERT: Some mounted directories, were not removed, a reboot is required."
}

enable_services() {
    create_symlink() {
        source="$1"
        target="$2"
        printf "Creating symlink for %s\n" "$source"
        ln -sf "$source" "archiso/airootfs/etc/systemd/system/$target"
    }
    
    create_symlink "/usr/lib/systemd/system/graphical.target" "default.target"
    create_symlink "/usr/lib/systemd/system/gdm.service" "display-manager.service"
    create_symlink "/usr/lib/systemd/system/NetworkManager.service" "multi-user.target.wants/NetworkManager.service"
    create_symlink "/usr/lib/systemd/system/NetworkManager-dispatcher.service" "dbus-org.freedesktop.nm-dispatcher.service"
    create_symlink "/usr/lib/systemd/system/NetworkManager-wait-online.service" "network-online.target.wants/NetworkManager-wait-online.service"
}

install_chaotic_aur() {
    echo "Chaotic AUR is not available. You need to install it, press ENTER. "
    read -r install
    
    if [[ ${install:0:1} == "y" || ${install:0:1} == "" ]]; then
        echo "Installing Chaotic AUR"
        sudo pacman-key --recv-key 3056513887B78AEB --keyserver keyserver.ubuntu.com
        sudo pacman-key --lsign-key 3056513887B78AEB
        sudo pacman -U --noconfirm 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-keyring.pkg.tar.zst' 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-mirrorlist.pkg.tar.zst'
        if [ -f /etc/pacman.d/chaotic-mirrorlist ]; then
            echo "Successfully installed Chaotic AUR, continuing with the build."
        else
            echo "Failed to install Chaotic AUR, building cannot continue."
            rerun=false
        fi
    else
        echo "Quitting gracefully."
        rerun=false
    fi
}

echo "Now building aerOS version 2.0 PP1..."

if [ ! -f /etc/pacman.d/chaotic-mirrorlist ]; then
    install_chaotic_aur
fi

rerun=true
while $rerun; do
    if [ -d work ]; then
        clean
    fi

    enable_services

    if ! sudo mkarchiso -v archiso; then
        retcod=$?
        set +e
        echo
        echo -n "We couldn't build aerOS. Try again? [y/N] "
        read -r retry
        if [[ ${retry:0:1} != "y" ]]; then
            rerun=false
        fi
    else
        rerun=false
        echo "Quitting gracefully."
    fi
done

[ -d work ] && clean

exit "$retcod"
