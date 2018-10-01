import { IsDefined, IsFQDN, IsIn, IsString, validate } from "class-validator"
import { plainToClass } from "class-transformer"
import dotenv = require("dotenv")
import zlib = require("zlib")
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
async function getMgmtServer(
  minio: Minio.Client,
  bucket: string,
  region: string,
) {
  fs.mkdirpSync(STORAGE_DIR)
  try {
    if (!(await minio.bucketExists(bucket))) {
      await minio.makeBucket(bucket, region)
    }
  } catch (error) {
    throw new Error(`Failed to make sure bucket is created ${error.message}`)
  }

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
    await syncDirectories(minio, minioBucket, "")
    try {
      const app = await getMgmtServer(minio, minioBucket, minioRegion)
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
