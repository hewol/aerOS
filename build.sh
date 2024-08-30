#!/bin/bash
set -e

clean() {
    echo "Cleaning work directory"
    sudo umount -Rq work
    sudo rm -rf work || echo "NOTE: Some mounted directories were not removed, a reboot is required."
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
            code=1
        fi
    else
        rerun=false
        echo "Quitting gracefully."
        code=0
    fi
done

[ -d work ] && clean

exit "$code"
