# fix for screen readers
if grep -Fqa 'accessibility=' /proc/cmdline &> /dev/null; then
    setopt SINGLE_LINE_ZLE
fi

~/.automated_script.sh

rm -rf lsb-release
mv lsb-release2 lsb-release
neofetch
startx
