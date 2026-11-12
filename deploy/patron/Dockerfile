# syntax=docker/dockerfile:1
# =============================================================================
# ADNAN ŞAHİN PATRON BULUTU — yalnız `sunucu` imajı (web sürümü ve şifreli yedek imajı YOK)
# =============================================================================
# Bağlam: `imaj-derle.sh`in HEAD'den (git archive) kurduğu temiz dizin (`sunucu/` + `patron-baslat.sh`);
# `.env`, `node_modules`, anahtar dosyası bağlama girmez. İmaj derleme makinesinde kurulur, VDS'e
# `docker save | ssh … docker load` ile taşınır (kayıt deposu YOK).
#
#   sunucu — node dist/server.js (tek süreç, tek dinleyici: /v1 · /api · /saglik) · Prisma şema motoru +
#            derlenmiş CLI'lar (göç · roller · tesis-db · tesis/ilk yönetici) aynı imajda, `goc` rolüyle koşar.
# Root OLMAYAN kullanıcı (10001); uygulama dosyaları root'a ait, compose kök FS'i salt okunur bağlar.
# Taban imaj özetle sabit (ana ürün TeksERP@19aa48a9 ile aynı özet).
# =============================================================================
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

FROM ${NODE_IMAGE} AS derleme
# Prisma şema motoru (migrate deploy) libssl ister; sorgu yolu WASM + pg bağdaştırıcısıdır.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /uygulama
COPY sunucu/package.json sunucu/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY sunucu/ ./
# generate: istemci + bu platformun şema motoru (çalışma anında ağ YOK — iç ağ internal).
RUN npx prisma generate \
 && npx prisma version \
 && npx tsc -p tsconfig.json \
 && npx tsc --ignoreConfig --outDir dist-cli --rootDir . --target es2022 --module commonjs --esModuleInterop \
      --strict --skipLibCheck --resolveJsonModule --types node scripts/tesis.ts scripts/db-rolleri.ts scripts/tesis-db.ts \
 && npm prune --omit=dev \
 && test -f dist/server.js \
 && test -f dist-cli/scripts/tesis.js && test -f dist-cli/scripts/db-rolleri.js && test -f dist-cli/scripts/tesis-db.js \
 && ls node_modules/@prisma/engines | grep -q '^schema-engine-'

FROM ${NODE_IMAGE} AS sunucu
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -g 10001 patron \
 && useradd -u 10001 -g 10001 -M -d /tmp -s /usr/sbin/nologin patron
WORKDIR /uygulama
COPY --from=derleme /uygulama/node_modules ./node_modules
COPY --from=derleme /uygulama/dist ./dist
COPY --from=derleme /uygulama/dist-cli ./dist-cli
COPY --from=derleme /uygulama/prisma ./prisma
COPY --from=derleme /uygulama/prisma.config.ts /uygulama/package.json ./
COPY --chmod=0755 patron-baslat.sh /usr/local/bin/patron-baslat
ENV NODE_ENV=production \
    HOME=/tmp \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    ANAHTAR_DIZINI=/anahtarlar \
    KURULUM_KAYNAGI=kayit
USER 10001:10001
EXPOSE 4620
ENTRYPOINT ["/usr/local/bin/patron-baslat"]
CMD ["node", "dist/server.js"]
