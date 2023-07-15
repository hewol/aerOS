# This build script for docker on GitHub is different from public build script,
# This docker script and docker stuffs is only used for testing weather build works or not,
# If build dont work a further change/error fix will be commited by a contibuter .

# Start

# Fix Pacman Keyrings
pacman-key --init 
pacman-key --populate  
pacman-key --refresh-keys
pacman -Sy archlinux-keyring --noconfirm

# Updates System and installs packages
pacman -Syu gdm git archiso networkmanager network-manager-applet neofetch --noconfirm


# Installs Chaotic AUR
pacman-key --recv-key 3056513887B78AEB --keyserver keyserver.ubuntu.com
pacman-key --lsign-key 3056513887B78AEB
pacman -U --noconfirm 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-keyring.pkg.tar.zst' 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-mirrorlist.pkg.tar.zst'

# Git Clones the hewol/aerOS repo
cd /root
git clone https://github.com/hewol/aerOS.git
cd /root/aerOS

# Creates Services
ln -svf /usr/lib/systemd/system/graphical.target archlive/airootfs/etc/systemd/system/default.target
ln -svf /usr/lib/systemd/system/gdm.service archlive/airootfs/etc/systemd/system/display-manager.service
mkdir -p archlive/airootfs/etc/systemd/system/multi-user.target.wants
ln -svf /usr/lib/systemd/system/NetworkManager.service archlive/airootfs/etc/systemd/system/multi-user.target.wants/NetworkManager.service
ln -svf /usr/lib/systemd/system/NetworkManager-dispatcher.service archlive/airootfs/etc/systemd/system/dbus-org.freedesktop.nm-dispatcher.service
mkdir -p archlive/airootfs/etc/systemd/system/network-online.target.wants
ln -svf /usr/lib/systemd/system/NetworkManager-wait-online.service archlive/airootfs/etc/systemd/system/network-online.target.wants/NetworkManager-wait-online.service

# Builds aerOS
mkarchiso -v archlive

# Deletes repo folder
umount -a
cd /root
rm -rf aerOS

# Finish



