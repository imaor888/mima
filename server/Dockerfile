FROM node:22-slim

WORKDIR /app

# 依赖：pg 是 optionalDependencies，postgres 模式需要它
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# 以下为镜像默认值，Render 控制台的环境变量会覆盖它们
ENV PORT=8787
ENV DB_DRIVER=sqlite
ENV DB_FILE=/app/data/guobao.db

# sqlite 数据落盘目录（免费层无持久磁盘，生产建议 DB_DRIVER=postgres）
VOLUME ["/app/data"]

EXPOSE 8787

CMD ["node", "--experimental-sqlite", "src/index.js"]
