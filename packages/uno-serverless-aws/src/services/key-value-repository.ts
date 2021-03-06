import { S3 } from "aws-sdk";
import { checkHealth, CheckHealth, HttpStatusCodes, KeyValueRepository, randomStr } from "uno-serverless";
import { S3Client } from "./s3-client";

export interface S3KeyValueRepositoryOptions {
  /** S3 bucket name. */
  bucket: string | Promise<string>;

  /** The content type for the files. */
  contentType?: string;

  /** Base path to use in the bucket. */
  path?: string;

  /** S3 client to use. */
  s3?: S3Client;

  /** The server side encryption to use */
  serverSideEncryption?: string;

  /** Custom deserializer. */
  deserialize?<T>(text: string): T;

  /** Custom serializer. */
  serialize?<T>(value: T): string;
}

/**
 * KeyValueRepository that uses S3 as a backing store.
 */
export class S3KeyValueRepository implements KeyValueRepository, CheckHealth {

  /** Options resolved with default values. */
  private readonly options: Required<S3KeyValueRepositoryOptions>;

  public constructor(
    {
      bucket,
      contentType = "application/json",
      path = "",
      s3 = new S3({ maxRetries: 3 }),
      serverSideEncryption = "",
      deserialize = <T>(text: string) => JSON.parse(text),
      serialize = <T>(value: T) => JSON.stringify(value),
    }: S3KeyValueRepositoryOptions) {
    this.options = {
      bucket,
      contentType,
      deserialize,
      path: path.endsWith("/") ? path.slice(0, -1) : path,
      s3,
      serialize,
      serverSideEncryption,
    };
  }

  public async checkHealth() {
    return checkHealth(
      "S3KeyValueRepository",
      `${await this.options.bucket}/${this.options.path}`,
      async () => {
        const testKey = randomStr();
        await this.set(testKey, { testKey });
        await this.delete(testKey);
      });
  }

  /** Delete the value associated with the key */
  public async delete(key: string): Promise<void> {
    await this.options.s3.deleteObject({
      Bucket: await this.options.bucket,
      Key: this.getKey(key),
    }).promise();
  }

  /** Get the value associated with the key */
  public async get<T>(key: string): Promise<T | undefined> {
    try {
      const response = await this.options.s3.getObject({
        Bucket: await this.options.bucket,
        Key: this.getKey(key),
      }).promise();
      if (!response.Body) {
        return undefined;
      }

      return this.options.deserialize<T>(response.Body.toString());
    } catch (error) {
      if (error.statusCode === HttpStatusCodes.NOT_FOUND) {
        return undefined;
      }

      throw error;
    }
  }

  /** Set the value associated with the key */
  public async set<T>(key: string, value: T): Promise<void> {
    await this.options.s3.putObject({
      Body: this.options.serialize(value),
      Bucket: await this.options.bucket,
      ContentType: this.options.contentType,
      Key: this.getKey(key),
      ServerSideEncryption: this.options.serverSideEncryption ? this.options.serverSideEncryption : undefined,
    }).promise();
  }

  /** Computes the path + key. */
  private getKey(key: string) { return `${this.options.path}/${key}`; }
}
