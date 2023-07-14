##
# NAME             : hewol/aerOS
# TO_BUILD         : docker build --rm -t hewol/aerOS:latest .
# TO_RUN           : docker run --rm -v /tmp:/tmp -t -i --privileged hewol/aerOS:latest
##

FROM library/archlinux:latest


#Sync packages databases and updates
RUN pacman -Syu --noconfirm

#Install git and archiso and other
RUN pacman -S git archiso gdm networkmanager network-manager-applet --noconfirm

# Fixes Keyring
RUN pacman-key --init 
RUN pacman-key --populate  
RUN pacman-key --refresh-keys 
RUN pacman -Sy archlinux-keyring --noconfirm

# Install Chaotic AUR
RUN pacman-key --recv-key 3056513887B78AEB --keyserver keyserver.ubuntu.com
RUN pacman-key --lsign-key 3056513887B78AEB
RUN pacman -U --noconfirm 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-keyring.pkg.tar.zst' 'https://cdn-mirror.chaotic.cx/chaotic-aur/chaotic-mirrorlist.pkg.tar.zst'

#Copy the build script and allow him to be executed
COPY files/build.sh root/

#Place the terminal in the home folder
RUN ["chmod", "+x", "root/build.sh"]

ENTRYPOINT ["./root/build.sh"]
