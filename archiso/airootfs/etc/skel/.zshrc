#!/bin/zsh
#
# ~/.zshrc
#

# If not running interactively, don't do anything
[[ -o interactive ]] && return

eval "$(oh-my-posh init zsh --config https://raw.githubusercontent.com/dreamsofautonomy/zen-omp/main/zen.toml)"
export QT_STYLE_OVERRIDE=Orchis-Dark
