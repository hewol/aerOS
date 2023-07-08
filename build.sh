#!/usr/bin/env bash

set -e

rerun=true
clean() {
    echo "Cleaning work directory"
    sudo umount -Rq work || true
    sudo rm -r work
}

while $rerun; do
    test -d work && clean
    # ! sudo mkarchiso -v archlive 2>&1 | tee debug.log
    ! sudo mkarchiso -v archlive
    retcod=${PIPESTATUS[0]}
    if [ $retcod == 0 ]; then
        rerun=false
    else
        echo
        # echo "Build failed with the following errors"
        # grep -i 'error\|warning\|failed' debug.log
        echo -n "Do you want to retry the build[y|N]: " && read retry
        if [[ ${retry:0:1} != "y" ]]; then
            rerun=false
        else
            echo
        fi
    fi
done

[[ $retcod == 0 ]] && echo "Building finished successfully." || echo "Building failed."
