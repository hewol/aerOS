#!/bin/bash
#
# ~/.bashrc
#

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

eval "$(oh-my-posh init bash --config https://raw.githubusercontent.com/dreamsofautonomy/zen-omp/main/zen.toml)"
export QT_STYLE_OVERRIDE=Orchis-Dark
