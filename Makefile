.DEFAULT_GOAL := build-iso

build-iso:
	./build.sh

build-update:
	mkdir work work/squashfs work/copy
	7z e ./out/aerOS*.iso -o./work/ 'arch/x86_64/airootfs.sfs'
	mount ./work/airootfs.sfs ./work/squashfs -t squashfs -o loop
	rsync -aAX ./work/squashfs --exclude={"./work/squashfs/home/*","./work/squashfs/tmp/*","./work/squashfs/dev/*","./work/squashfs/media/*","./work/squashfs/mnt/*","./work/squashfs/proc/*","./work/squashfs/root/*","./work/squashfs/run/*","./work/squashfs/sys/*","./work/squashfs/lost+found"} --info=progress2 ./work/copy
	tar cf - ./work/copy | pv -s $(du -sb ./work/copy | awk '{print $1}') | gzip > ./out/update.tar.gz
	umount -Rq ./work/squashfs
	rm -rf work
