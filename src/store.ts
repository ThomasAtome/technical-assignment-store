import 'reflect-metadata'

import { JSONArray, JSONObject, JSONPrimitive } from './json-types'

export type Permission = 'r' | 'w' | 'rw' | 'none';

export type StoreResult = Store | JSONPrimitive | undefined;

export type StoreValue =
    | JSONObject
    | JSONArray
    | StoreResult
    | (() => StoreResult);

export interface IStore {
    defaultPolicy: Permission;

    [index:string]: any

    allowedToRead (key: string): boolean;

    allowedToWrite (key: string): boolean;

    read (path: string): StoreResult;

    write (path: string, value: StoreValue): StoreValue;

    writeEntries (entries: JSONObject): void;

    entries (): JSONObject;
}

export function Restrict (permission?: Permission): PropertyDecorator {
    // I prefer to do an extra check as the decorator is responsible for safety.
    if (permission && !['r', 'w', 'rw', 'none'].includes(permission)) {
        throw new Error(`Invalid permission: ${permission}`)
    }

    if (!permission) {
        permission = 'none'
    }

    return (target: Object, propertyKey: string | symbol): void => {
        Reflect.defineMetadata('permission', permission, target, propertyKey)
    }
}

export class Store implements IStore {
    [key: string]: any

    defaultPolicy: Permission = 'rw'

    allowedToRead (key: string): boolean {
        const permission = Reflect.getMetadata('permission', this, key)
        if(permission) {
            return permission.includes('r')
        }
        return this.defaultPolicy.includes('r')
    }

    allowedToWrite (key: string): boolean {
        const permission = Reflect.getMetadata('permission', this, key)
        if(permission) {
            return permission.includes('w')
        }
        return this.defaultPolicy.includes('w')
    }

    read(path: string): StoreResult {
        const keys = path.split(':');
        const key = keys[0];

        // If we have a complexe path and the primary key is instanceof Store, all the nested permission are in the nested Store instance
        if (keys.length > 1 && this[key] instanceof Store) {
            return this[key].read(keys.slice(1).join(':'));
        }

        if (!this.allowedToRead(keys[0])) {
            throw new Error('No permission for read');
        }

        const result = keys.length > 1 ? this.performRead(keys, this) : this[key]

        return result instanceof Function ? result() : result;
    }

    write(path: string, value: StoreValue): StoreValue {
        const keys = path.split(':');
        const key = keys[0];

        // If we have a complexe path and the primary key is instanceof Store, all the nested permission are in the nested Store instance
        if (keys.length > 1 && this[key] instanceof Store) {
            return this[key].write(keys.slice(1).join(':'), value);
        }

        if (!this.allowedToWrite(keys[0])) {
            throw new Error('No permission for write');
        }

        this.performWrite(keys, value, this);

        return value;
    }

    writeEntries (entries: JSONObject): void {
        // Probably we can enhance it, but not sure about one of the test i commented
        for (const entry in entries) {
            this[entry] = entries[entry]
        }
    }

    entries (): JSONObject {
        const keys = Object.keys(this)
        const entries: JSONObject = {}
        for (const key of keys) {
            // Only check if already have metadata for this key and after check the permission
            if (Reflect.getMetadata('permission', this, key) && this.allowedToRead(key)) {
                entries[key] = this[key]
            }
        }
        return entries
    }

    private performRead(keys: string[], current: any): StoreResult | Function {
        const key = keys[0];

        if (current[key] instanceof Store) {
            return this.performRead(keys.slice(1), current[key]);
        } else if (current[key] instanceof Function) {
            return keys.length === 1 ? current[key]() : this.performRead(keys.slice(1), current[key]());
        } else if (keys.length > 1) {
            return this.performRead(keys.slice(1), current[key]);
        }

        return current[key];
    }

    private performWrite(keys: string[], value: StoreValue, current: any): void {
        const key = keys[0];

        if (keys.length > 1) {
            if (current[key] instanceof Store) {
                this.performWrite(keys.slice(1), value, current[key]);
            } else {
                current[key] = current[key] || {};
                this.performWrite(keys.slice(1), value, current[key]);
            }
        } else {
            current[key] = value;
        }
    }

}
