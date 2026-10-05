#!/usr/bin/env bash
# Build the Hostinger upload folder (hostinger/) and hostinger-upload.zip
# from the main site.
#
#   ./make-hostinger.sh                 # keep the www.example.com placeholder
#   ./make-hostinger.sh www.rkmec.in    # put your real domain in links/sitemap
#
# hostinger/ already holds the Hostinger-only files (config.php, .htaccess,
# chat-proxy.php, api/leads.php). This script only refreshes the copies of the
# pages, styles, scripts and photos, then points the chatbot and enquiry form
# at the PHP files instead of the Vercel /api/ routes.
set -euo pipefail
cd "$(dirname "$0")"

OUT=hostinger
DOMAIN="${1:-}"

# Static site files. crm.html is left out: on Hostinger the Google Sheet is the CRM.
PAGES=(index.html about.html album.html blog.html contact.html events.html news.html
       branch-govind-nagar.html branch-meharban-singh-purva.html branch-ratanlal-nagar.html)

rm -rf "$OUT/images"
cp "${PAGES[@]}" styles.css script.js chatbot.js robots.txt sitemap.xml "$OUT/"
cp -r images "$OUT/images"

# Replace one exact string in a file, and fail loudly if it is not there,
# so a change to the main site can't silently leave a Vercel URL behind.
swap() {
  local file=$1 from=$2 to=$3
  grep -qF -- "$from" "$file" || { echo "!! '$from' not found in $file" >&2; exit 1; }
  FROM="$from" TO="$to" perl -0pi -e 's/\Q$ENV{FROM}\E/$ENV{TO}/g' "$file"
}

swap "$OUT/chatbot.js" "var ENDPOINT   = '/api/chat';" "var ENDPOINT   = 'chat-proxy.php';"
swap "$OUT/script.js"  "fetch('/api/leads'"             "fetch('api/leads.php'"
swap "$OUT/script.js"  "the CRM at /crm.html"            "the school's Google Sheet"
swap "$OUT/robots.txt" $'Disallow: /crm.html\n'          ''

if [[ -n "$DOMAIN" ]]; then
  for f in "$OUT"/*.html "$OUT/sitemap.xml" "$OUT/robots.txt"; do
    FROM="https://www.example.com" TO="https://$DOMAIN" perl -pi -e 's/\Q$ENV{FROM}\E/$ENV{TO}/g' "$f"
  done
  BARE="${DOMAIN#www.}"
  FROM="'site_domain'   => 'example.com'" TO="'site_domain'   => '$BARE'" \
    perl -pi -e 's/\Q$ENV{FROM}\E/$ENV{TO}/g' "$OUT/config.php"
fi

rm -f hostinger-upload.zip
(cd "$OUT" && zip -qr -X ../hostinger-upload.zip . -x '*.DS_Store')
echo "Built $OUT/ and hostinger-upload.zip ($(du -h hostinger-upload.zip | cut -f1))"
