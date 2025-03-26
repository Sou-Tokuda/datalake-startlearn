#!/bin/bash

set -Ceuo pipefail
export PATH="/root/.embulk/bin:/usr/local/openjdk-8/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

embulk preview /root/conf/emb.yml.liquid
embulk run /root/conf/emb.yml.liquid