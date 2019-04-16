#!/bin/bash

#ledger-live app -u 'litecoin'
#ledger-live app -i 'litecoin'
#ledger-live app -o 'Litecoin'

ledger-live sync --device -c "litecoin" -i 0 -f json > tool/tests/example_1/test.json

cat tool/tests/example_1/test.json | jq '(.lastSyncDate,.blockHeight,.balance)|=0' > tool/tests/example_1/input/tmpInputAccounts.json
cat tool/tests/example_1/input/tmpInputAccounts.json | jq '(.operations)|=[]' > tool/tests/example_1/input/inputAccounts.json

rm tool/tests/example_1/test.json
rm tool/tests/example_1/input/tmpInputAccounts.json

ledger-live sync --file 'tool/tests/example_1/input/inputAccounts.json' -i 0 -f json > tool/tests/example_1/output/output.json

ledger-live app -q 'Litecoin'