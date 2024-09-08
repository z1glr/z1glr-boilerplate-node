import Ajv from "ajv";
import formatsPlugin from "ajv-formats";

export const ajv = new Ajv();
formatsPlugin(ajv);
