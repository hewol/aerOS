#!/bin/bash
set -e

clean() {
    echo "Cleaning work directory"
    sudo umount -Rq work && sudo rm -rf work || echo "NOTE: Some mounted directories were not removed, a reboot is required."
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

echo "Now building aerOS..."

rerun=true
while $rerun; do
    [ -d work ] && clean

    enable_services
	sudo mkarchiso -v archiso
	
    if [[ $? -eq 1 ]]; then
        set +e
        echo -n "We couldn't build aerOS. Try again? [y/N] "
        echo
        read -r retry
        if [[ ${retry:0:1} != "y" ]]; then
            rerun=false
        fi
    else
    	set +e
        rerun=false
        [ -d work ] && clean
        exit 0
    fi
done
