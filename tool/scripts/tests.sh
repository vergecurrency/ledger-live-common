#!/bin/bash

set -e
cd $(dirname $0)/../tests

for td in *; do
  cd $td
  rm -rf ./output/ ./dbdata/
  mkdir output
  echo "Running test $td..."
  bash ./test.sh
  diff ./output ./expected
  if [ $? -ne 0 ]; then
    echo "Unexpected result."
    exit 1
  fi
done
