.RECIPEPREFIX := $(.RECIPEPREFIX) 
.PHONY: all iso clean update test-sudo


all: test-sudo iso

iso: clean
    @echo "building ISO..."
    ./build.sh

update: clean
    @echo "creating update package..."
    @mkdir -pv work/fs
    7z e out/$$(ls -Art out | tail -n 1) -o./work arch/x86_64/airootfs.sfs
    unsquashfs -f -d ./work/fs ./work/airootfs.sfs
    ( cd ./work/fs && rm -rf etc/fstab etc/passwd etc/shadow etc/hostname etc/calamares etc/sudoers etc/group etc/gdm/custom.conf etc/xdg/Trolltech.conf etc/xdg/autostart/calamares.desktop etc/sudoers.d/g_wheel etc/pacman.d/gnupg )
    ( cd ./work/fs && rm -rf usr/bin/calamares usr/bin/calamares_polkit )
    ( cd ./work/fs && rm -rf usr/lib/calamares usr/lib/libcalamares* usr/lib/initcpio/hooks/archiso* && rm -rf usr/lib/firmware )
    ( cd ./work/fs && rm -rf var/lib/pacman/local )
    ( cd ./work/fs && rm -rf boot dev home mnt proc root run srv sys tmp )
    sed -i 's/archiso archiso_loop_mnt archiso_pxe_common archiso_pxe_nbd archiso_pxe_http archiso_pxe_nfs //g' ./work/fs/etc/mkinitcpio.conf
    ( cd ./work/fs && tar -cf - . | pv -s $$(du -sb . | awk -v OFMT='%d' '{ print $$1*1.02 }' | cut -f1) | gzip -9 > ../../out/update.tar.gz )

test-sudo:
    @[ $$UID = 0 ] || ( echo "error: must be root to do this."; false )

clean:
    rm -rf work
