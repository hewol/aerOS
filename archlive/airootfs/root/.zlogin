# fix for screen readers
if grep -Fqa 'accessibility=' /proc/cmdline &> /dev/null; then
    setopt SINGLE_LINE_ZLE
fi

~/.automated_script.sh

clear
rm -rf lsb-release
mv lsb-release2 lsb-release
neofetch
systemctl enable gdm
systemctl enable networkmanager
startx
