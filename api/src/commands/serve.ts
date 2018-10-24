import { IsDefined, IsFQDN, IsIn, IsString, validate } from "class-validator"
import { plainToClass } from "class-transformer"
import dotenv = require("dotenv")
import os = require("os")
import cors = require("cors")
import zlib = require("zlib")
import bodyParser = require("body-parser")

import express = require("express")
import fs = require("fs-extra-promise")
import Minio = require("minio")
import multer = require("multer")
import yargs = require("yargs")
import { AddressInfo } from "net"
import path = require("path")
import winston = require("winston")
import { isObject } from "util"
import tar = require("tar-fs")
import mime = require("mime-types")

const log = winston.createLogger({
  format: winston.format.combine(
    winston.format.splat(),
    winston.format.simple(),
  ),
  transports: [new winston.transports.Console()],
})
const { STORAGE_DIR = path.join(process.cwd(), "storage") } = process.env

const VERSION_FILE_NAME = "VERSION"
const ZIP_FORMAT = "zip"
const TAR_FORMAT = "tar"
const TARGZIP_FORMAT = "tar.gz"
interface Domain {
  domain: string
  paths: DomainPath[]
}
interface DomainPath {
  path: string
  activeVersion: string
  versions: DomainPathVersion[]
}
interface DomainPathVersion {
  name: string
  version: string
  date: Date
  size: number
  etag: string
}
let domains: Domain[] = []
async function updateDomains(
  minio: Minio.Client,
  bucket: string,
  prefix: string = "",
) {
  domains = await getDirectories(minio, bucket, prefix)
}
async function getDirectories(
  minio: Minio.Client,
  bucket: string,
  prefix: string = "",
): Promise<Domain[]> {
  return new Promise<Domain[]>(async (resolve, reject) => {
    const stream = await minio.listObjectsV2(bucket, prefix, true)
    const domains: Domain[] = []
    const items: Minio.BucketItem[] = []
    stream.on("data", function(obj) {
      items.push(obj)
    })
    stream.on("end" as any, async () => {
      for (const obj of items) {
        const parts = obj.name.split("/")
        const [domainName, ...rest] = parts

        let domain: Domain | undefined = domains.find(
          i => i.domain === domainName,
        )
        if (!domain) {
          domain = {
            domain: domainName,
            paths: [],
          }
          domains.push(domain)
        }
        const pathname = rest.join("/")
        const filename = path.basename(obj.name)
        const pathname2 =
          path.dirname(pathname) === "." ? "/" : path.dirname(pathname)

        const version: DomainPathVersion = {
          name: obj.name,
          version: path.basename(filename, ".tar.gz"),
          date: obj.lastModified,
          size: obj.size,
          etag: obj.etag,
        }
        let domainpath = domain.paths.find(i => i.path === pathname2)

        if (filename === VERSION_FILE_NAME) {
          const activeVersion = await readMinioFile(minio, bucket, obj.name)
          if (!domainpath) {
            domainpath = {
              path: pathname2,
              activeVersion: activeVersion,
              versions: [version],
            }
            domain.paths.push(domainpath)
          } else {
            domainpath.activeVersion = activeVersion
          }
          continue
        }
        if (!domainpath) {
          domainpath = {
            path: pathname2,
            activeVersion: "",
            versions: [version],
          }
          domain.paths.push(domainpath)
        } else {
          domainpath.versions.push(version)
        }
      }
      resolve(domains)
    })
  })
}
function setVersion(
  minio: Minio.Client,
  bucket: string,
  objectname: string,
  version: string,
) {
  log.info(`Setting version ${version} for ${objectname}`)
  return minio.putObject(bucket, objectname, version)
}
function readMinioFile(
  minio: Minio.Client,
  bucket: string,
  objectname: string,
) {
  return new Promise<string>(async (resolve, reject) => {
    const data = await minio.getObject(bucket, objectname)
    const chunks: any[] = []
    data.on("data", function(chunk) {
      chunks.push(chunk)
    })
    data.on("error", reject)
    data.on("end", async () => {
      const version = Buffer.concat(chunks).toString()
      resolve(version)
    })
  })
}
async function syncDirectories(
  minio: Minio.Client,
  bucket: string,
  prefix: string = "",
) {
  const stream = await minio.listObjectsV2(bucket, prefix, true)
  stream.on("data", async function(obj) {
    if (path.basename(obj.name) === VERSION_FILE_NAME) {
      const data = await minio.getObject(bucket, obj.name)
      const chunks: any[] = []
      data.on("data", function(chunk) {
        chunks.push(chunk)
      })
      data.on("end", async () => {
        const version = Buffer.concat(chunks).toString()
        const dirname = path.dirname(obj.name)
        const currentVersionFile = path.join(
          STORAGE_DIR,
          dirname,
          VERSION_FILE_NAME,
        )
        if (await fs.existsAsync(currentVersionFile)) {
          const currentVersion = await fs.readFileAsync(currentVersionFile)
          if (currentVersion.toString() === version) {
            log.info(`${dirname} is already synced`)
            return
          }
        }
        const currentDeploys = await minio.listObjectsV2(
          bucket,
          path.join(dirname, version),
        )
        let zipCount = 0
        currentDeploys.on("data", async row => {
          if (zipCount >= 1) {
            log.error(`${dirname} has 2 versions ${version}`)
            throw new Error("Two files with the same version uploaded")
          }
          zipCount++
          const zipStream = await minio.getObject(bucket, row.name)
          const destDir = path.join(STORAGE_DIR, dirname)
          await fs.mkdirpAsync(destDir)
          zipStream
            .pipe(zlib.createGunzip())
            .pipe(tar.extract(destDir, {}))
            .on("finish", async () => {
              await fs.writeFileAsync(currentVersionFile, version)
              log.info(`${dirname} succesfully synced`)
            })
        })
      })
    }
  })
}

async function getStaticServer() {
  const app = express()
  app.use((req, res) => {
    const domain = domains.find(d => d.domain === req.hostname)
    if (domain) {
      const domainpath = domain.paths
        .sort((a, b) => b.path.length - a.path.length)
        .find(i => req.path.startsWith(i.path))
      if (domainpath) {
        res.header("X-DEPLOY-CDN", domainpath.activeVersion)
      }
    }
    res.sendFile(
      path.join(
        STORAGE_DIR,
        req.hostname,
        mime.lookup(req.path) ? req.path : `${req.path}/index.html`,
      ),
    )
  })

  const errorHandler: express.ErrorRequestHandler = (err, req, res, next) => {
    log.warn(`${req.hostname} ${req.path} not found, fallback to index.html`)
    res.sendFile(path.join(STORAGE_DIR, req.hostname, "index.html"))
  }
  app.use(errorHandler)
  return app
}
async function getMgmtServer(minio: Minio.Client, bucket: string) {
  fs.mkdirpSync(STORAGE_DIR)
  await updateDomains(minio, bucket, "")
  class PostQuery {
    @IsDefined()
    @IsIn([ZIP_FORMAT, TAR_FORMAT, TARGZIP_FORMAT])
    format!: string
    @IsDefined()
    @IsFQDN()
    host!: string
    @IsString()
    @IsDefined()
    path!: string
  }
  const app = express()
  app.get("/ping", (req, res) => {
    res.json({
      message: "alive",
    })
  })
  app.use(cors())
  app.get("/domains", async (req, res, next) => {
    try {
      res.json(domains)
    } catch (error) {
      next(error)
    }
  })
  app.get("/domains/:name", async (req, res, next) => {
    try {
      res.json(domains.filter(i => i.domain === req.params.name))
    } catch (error) {
      next(error)
    }
  })
  app.put(
    "/domains/:name/paths/:path/version",
    bodyParser.json(),
    async (req, res, next) => {
      try {
        if (!req.body.version) {
          res.status(400)
          res.json({
            message: "Version body is missing",
          })
          return
        }
        const domain = domains.find(i => i.domain === req.params.name)
        if (domain) {
          const domainpath = domain.paths.find(p => p.path === req.params.path)
          if (domainpath) {
            const prefix = path.join(domain.domain, domainpath.path)
            await setVersion(
              minio,
              bucket,
              path.join(prefix, VERSION_FILE_NAME),
              req.body.version,
            )
            await syncDirectories(minio, bucket, prefix)
            await updateDomains(minio, bucket, prefix)
          } else {
            res.sendStatus(404)
          }
          res.json(domains.filter(i => i.domain === req.params.name))
        } else {
          res.sendStatus(404)
        }
      } catch (error) {
        next(error)
      }
    },
  )
  app.post(
    "/",
    multer({ dest: path.join(process.cwd(), "uploads") }).single("file"),
    async (req, res, next) => {
      try {
        req.query.format = req.query.format
          ? req.query.format.toLowerCase()
          : ""
        const query = plainToClass<PostQuery, Object>(
          PostQuery,
          req.query as Object,
        )
        const errors = await validate(query)
        if (!!errors.length) {
          res.status(400)
          res.json(errors)
          return
        }
        if (!req.file) {
          res.json({
            message: "Part file is missing",
          })
          return
        }
        const metadata = isObject(req.query.metadata) ? req.query.metadata : {}
        const time = Date.now()
        const folder = path.join(query.host, query.path)
        const objectName = path.join(
          folder,
          `${time.toString()}.${query.format}`,
        )
        const versionName = path.join(folder, VERSION_FILE_NAME)
        const fileReader = fs.createReadStream(req.file.path)
        await minio.putObject(
          bucket,
          objectName,
          fileReader,
          req.file.size,
          metadata,
        )
        await minio.putObject(bucket, versionName, time.toString())
        res.json({
          message: "Upload successfully",
        })
        syncDirectories(minio, bucket, folder)
        fs.unlink(req.file.path, err => {
          if (err) {
            log.error(
              `Failed to remove multer file ${req.file.path} ${err.message}`,
            )
          }
        })
      } catch (error) {
        next(error)
      }
    },
  )
  return app
}

class ServeCommand {
  aliases: string
  command: string
  describe: string
  constructor() {
    this.aliases = "s"
    this.command = "serve"
    this.describe = "Spin up a directory"
  }
  async handler(args: yargs.Arguments) {
    const {
      minioHost,
      minioPort,
      minioAccessKey,
      minioSecretKey,
      minioRegion,
      minioSsl,
      mgmtPort,
      minioBucket,
      port,
    } = args
    const minio = new Minio.Client({
      endPoint: minioHost,
      port: minioPort,
      accessKey: minioAccessKey,
      secretKey: minioSecretKey,
      region: minioRegion,
      useSSL: minioSsl,
    })
    if (!(await minio.bucketExists(minioBucket))) {
      await minio.makeBucket(minioBucket, minioRegion)
    }
    await syncDirectories(minio, minioBucket, "")
    try {
      const app = await getMgmtServer(minio, minioBucket)
      const server = app.listen(mgmtPort, () => {
        const { address, port } = server.address() as AddressInfo
        log.info(`MGMT api listening on ${address}${port}`)
      })
    } catch (error) {
      log.error(`Failed to init mgmt server ${error.message}`)
      process.exit(1)
    }
    try {
      const app = await getStaticServer()
      const server = app.listen(port, () => {
        const { address, port } = server.address() as AddressInfo
        log.info(`Static server listening on ${address}${port}`)
      })
    } catch (error) {
      log.error(`Failed to init mgmt server ${error.message}`)
      process.exit(1)
    }
  }
  builder(argv: yargs.Argv) {
    dotenv.config()
    return argv.option({
      minioHost: {
        required: true,
      },
      minioPort: {
        type: "number",
        required: true,
      },
      minioAccessKey: {
        required: true,
      },
      minioSecretKey: {
        required: true,
      },
      minioRegion: {
        default: "",
      },
      minioBucket: {
        default: "cdn",
      },
      minioSsl: {
        type: "boolean",
        default: false,
      },
      storageDir: {
        default: path.join(process.cwd(), "storage"),
        description: "Directory where static files will be written",
      },
      mgmtPort: {
        default: 13000,
        description: "Management port",
      },
      port: {
        default: 3000,
        description: "Static file server port",
      },
    })
  }
}

export = ServeCommand
