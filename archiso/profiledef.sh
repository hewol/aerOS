#!/usr/bin/env bash
# shellcheck disable=SC2034

iso_name="aerOS"
iso_label="AEROS_V2"
iso_publisher="Hewol <https://hewol.github.io>"
iso_application="aerOS Live CD/Installation Medium"
iso_version="v2-PRE-$(date +%Y%m%d)"
install_dir="arch"
buildmodes=('iso')
bootmodes=('bios.syslinux.mbr' 'bios.syslinux.eltorito'
           'uefi-ia32.systemd-boot.esp' 'uefi-x64.systemd-boot.esp'
           'uefi-ia32.systemd-boot.eltorito' 'uefi-x64.systemd-boot.eltorito')
arch="x86_64"
pacman_conf="pacman.conf"
airootfs_image_type="squashfs"
airootfs_image_tool_options=('-comp' 'zstd' '-Xcompression-level' '19' '-b' '1M')
file_permissions=(
  ["/etc/shadow"]="0:0:400"
  ["/etc/rc.local"]="0:0:755"
  ["/usr/local/bin/aeros-update"]="0:0:755"
  ["/usr/local/bin/aeros-pkg"]="0:0:755"
  ["/usr/local/bin/aeros-refresh"]="0:0:755"
  ["/usr/local/bin/aeros-reset"]="0:0:755"
  ["/usr/local/bin/livecd-sound"]="0:0:755"
  ["/usr/bin/calamares_polkit"]="0:0:755"
)

# Insert GPG key of Hewol here
# gpg_key=KEY_HERE
