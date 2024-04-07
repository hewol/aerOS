.DEFAULT_GOAL := build-iso

build-iso:
	./build.sh

build-update:
	mkdir work work/squashfs work/copy
	7z e ./out/aerOS*.iso -o./work/ 'arch/x86_64/airootfs.sfs'
	7z x ./work/airootfs.sfs -o./work/squashfs
	rsync -aAX ./work/squashfs/ --exclude={"./work/squashfs/home/*","./work/squashfs/tmp/*","./work/squashfs/dev/*","./work/squashfs/media/*","./work/squashfs/mnt/*","./work/squashfs/proc/*","./work/squashfs/root/*","./work/squashfs/run/*","./work/squashfs/sys/*","./work/squashfs/lost+found"} --info=progress2 --no-inc-recursive ./work/copy
	cd ./work/copy && tar cf - . | pv -s $$(du -sb . | awk '{print $$1}') | gzip > ../../out/update.tar.gz
	rm -rf work
