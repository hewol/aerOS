#!/bin/bash

# Check if wget is installed
if ! command -v wget &> /dev/null
then
    echo "wget could not be found"
    echo "Installing wget..."
    sudo pacman -Sy wget
    if [ $? -ne 0 ]; then
        echo "Failed to install wget. Error code: $?"
        exit 1
    fi
fi

# Get the latest release
echo "Fetching information about the latest release..."
latest_release_info=$(wget -qO- https://api.github.com/repos/hewol/aerOS/releases/latest)

# Extract the download URL for aeros-update-prepare
download_url=$(echo "$latest_release_info" | grep "browser_download_url.*aeros-update-prepare" | cut -d : -f 2,3 | tr -d \" | tr -d " ")

# Download the file if it does not exist
if [ ! -f aeros-update-prepare ]; then
    echo "Downloading aerOS installer from $download_url..."
    if ! wget $download_url -O aeros-update-prepare
    then
        echo "Failed to download aeros-update-prepare. Error code: $?"
        exit 1
    fi
else
    echo "aerOS installer already downloaded..."
fi

# Make it executable
echo "aerOS Installer Setup: Making the file executable"
if ! chmod +x aeros-update-prepare
then
    echo "Failed to make aeros-update-prepare executable. Error code: $?"
    rm -f aeros-update-prepare
    exit 1
fi

#Execute the executable
echo "aerOS Installer Setup: Starting aerOS Installer"
if ! sudo ./aeros-update-prepare
then
    echo "Failed to execute aeros-update-prepare. Error code: $?"
    rm -f aeros-update-prepare
    exit 1
fi