# Server for storing single page apps on Minio and serving them with node.js

Dependencies:
- S3 server (like minio)


Create a .env like  .env.example

Spin up the server
```bash
yarn install
yarn cli serve
```

Upload a folder with an index.html
```bash
yarn cli upload -d ./examples/page1 --host example.org 
```

Then test it
```bash
curl -H 'Host:example.org' localhost:3000
```