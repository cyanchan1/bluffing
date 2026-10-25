#!/usr/bin/env bash
# Source this file to use the project's Homebrew runtimes.
bluff_brew_prefix="$(brew --prefix)"
export JAVA_HOME="$bluff_brew_prefix/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$bluff_brew_prefix/opt/node@24/bin:$bluff_brew_prefix/opt/postgresql@16/bin:$bluff_brew_prefix/opt/coreutils/libexec/gnubin:$bluff_brew_prefix/bin:$PATH"
