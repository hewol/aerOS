# fix for screen readers
if grep -Fqa 'accessibility=' /proc/cmdline &> /dev/null; then
    setopt SINGLE_LINE_ZLE
fi

~/.automated_script.sh

clear
rm -rf /etc/lsb-release
cp /etc/lsb-release2 /etc/lsb-release

