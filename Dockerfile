FROM node:8.9.1 as build-env
WORKDIR /app
COPY ./package.json ./
COPY ./yarn.lock ./
RUN yarn install
COPY ./src ./src
COPY ./tsconfig.json ./
RUN yarn build

FROM gcr.io/distroless/nodejs:debug
COPY --from=build-env /app /app
WORKDIR /app
CMD ["dist/cli.js"]
ENTRYPOINT [ "/nodejs/bin/node", "dist/cli.js" ]