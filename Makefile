.RECIPEPREFIX := $(.RECIPEPREFIX) 
.DEFAULT_GOAL := build-iso

build-iso:
    ./build.sh && echo "ISO built, check $(ls /out/aerOS*.iso)." || echo "ISO not built, try again."; exit 1
