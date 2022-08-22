#!/usr/bin/env bash
set -e

cd ../minime
export GOOS=linux
export GOARCH=mips
export GOMIPS=softfloat
go build -o ../mipigo/minime

cd ../mipigo
file minime

if [[ ! -d venv ]]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip3 install -r requirements.txt
./compile.py
deactivate
