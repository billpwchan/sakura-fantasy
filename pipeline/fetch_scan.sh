#!/bin/zsh
# download a Sketchfab model's glTF archive into pipeline/skfb/<uid> and unpack it. Every scan the pipeline uses is
# CC0 (see README.md); downloading still needs your own Sketchfab API token in $SKFB_KEY.
# usage: SKFB_KEY=<your token> ./fetch_scan.sh <uid>
mkdir -p ${0:a:h}/skfb && cd ${0:a:h}/skfb
u=$1
[ -d $u ] && { echo "$u already here"; exit 0; }
for try in 1 2 3; do
  r=$(curl -fsS -H "Authorization: Token $SKFB_KEY" "https://api.sketchfab.com/v3/models/$u/download" 2>&1)
  url=$(echo "$r" | jq -r '.gltf.url // empty' 2>/dev/null)
  [ -n "$url" ] && break
  echo "$u try$try: $(echo $r | head -c 120)"; sleep 70
done
[ -z "$url" ] && exit 1
curl -fsSL -o $u.zip "$url" && mkdir -p $u && unzip -oq $u.zip -d $u && echo "$u ok $(du -sh $u.zip | cut -f1)"
