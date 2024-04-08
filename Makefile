.RECIPEPREFIX := $(.RECIPEPREFIX) 
.DEFAULT_GOAL := build-iso

build-iso:
    ./build.sh

build-update:
    set -o pipefail
    rm -rf work && mkdir work work/squashfs
    7z e ./out/aerOS*.iso -o./work/ 'arch/x86_64/airootfs.sfs'
    7z x ./work/airootfs.sfs -o./work/squashfs
    cd ./work/squashfs && rm -rf etc/passwd etc/shadow etc/calamares etc/xdg/autostart/calamares.desktop usr/bin/calamares usr/bin/calamares_polkit home tmp dev media mnt proc root run sys lost+found
    cd ./work/squashfs && tar cf - . | pv -s $$(du -sb . | awk '{print $$1}') | gzip > ../../out/update.tar.gz
    rm -rf work
