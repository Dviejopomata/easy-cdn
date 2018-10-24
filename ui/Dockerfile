FROM node:10.4.1 as build-env
WORKDIR /app
COPY ./package.json ./
COPY ./yarn.lock ./
RUN yarn install
COPY . ./
RUN yarn build 

FROM scratch
COPY --from=build-env /app/public /srv/http
CMD [ "tail","-f","/dev/null" ]
