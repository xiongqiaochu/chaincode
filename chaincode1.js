/*
 * @Author: wangchao
 * @Date: 2020-11-23 16:23:11
 * @Description: 链码文件，支持增删查，假设传入的参数为json格式的字符串
 */
const shim = require('fabric-shim')
const logger = shim.newLogger('Chaincode')

var Chaincode = class {
    /**
     * 构造器
     */
    constructor() {
        this.logger = shim.newLogger(this.constructor.name)
    }

    /**
     * @description: 实例化链码, 对应peer chaincode instantiate 
     * @param {ChaincodeStub} stub 
     * @return {SuccessResponse/ErrorResponse} 返回成功/错误状态
     */
    async Init (stub) {
        logger.debug('========= 实例化链码 =========')
        let req = stub.getFunctionAndParameters()
        let json = req.params[0]
        try {
            json = JSON.parse(json) // 检查是否为json数据
        } catch (err) {
            return shim.error(err)
        }
        let key = this.toKey(stub, json)
        logger.debug('key为： ' + key)
        try {
            await stub.putState(key, Buffer.from(JSON.stringify(json)))
            logger.debug(key + '的值已设置为：' + JSON.stringify(json))
            return shim.success() // 返回成功状态
        } catch (err) {
            return shim.error(err) // 返回错误状态
        }
    }

    /**
     * @description: 调用链码，对应peer node invoke
     * @param {ChaincodeStub} stub
     * @return {SuccessResponse/ErrorResponse} 返回成功/错误状态
     */
    async Invoke (stub) {
        logger.debug('========= 调用链码 =========')
        let req = stub.getFunctionAndParameters()
        logger.debug('调用的函数为： ' + req.fcn)
        let method = this[req.fcn] // 得到要调用的函数
        if (!method) {
            logger.debug('函数:' + req.fcn + ' 未找到')
            return shim.error('函数:' + req.fcn + ' 未找到')
        }
        method = method.bind(this) // 将method函数绑定到this对象，使其内部的this指向该对象
        let json = req.params[0]
        try {
            json = JSON.parse(json) // 检查是否为json数据
        } catch (err) {
            return shim.error(err)
        }
        try {
            let ret = await method(stub, json)
            if (ret && !Buffer.isBuffer(ret))
                ret = Buffer.from(ret)
            return shim.success(ret)
        } catch (err) {
            return shim.error(err)
        }
    }

    /**
     * @description: 组合键单一查询
     * @param {ChaincodeStub} stub
     * @param {Object} args
     * @return {string}} 根据key获取到的value
     */
    async get (stub, args) {
        logger.debug('========= 获取键对应的值 ==========')
        let key = this.toKey(stub, args)
        logger.debug('key为： ' + key)
        let value = await stub.getState(key)
        logger.debug('查询到key= ' + key + '的状态为： ' + value.toString())
        return value.toString()
    }

    /**
     * @description: 设置键值对
     * @param {ChaincodeStub} stub
     * @param {Object} args
     * @return {void}
     */
    async put (stub, args) {
        logger.debug('========= 设置键值对 ==========')
        let key = this.toKey(stub, args)
        let json = args
        logger.debug('key为： ' + key)
        await stub.putState(key, Buffer.from(JSON.stringify(json)))
        logger.debug(key + '的值已设置为：' + JSON.stringify(json))
    }

    /**
     * @description: 删除键值对
     * @param {ChaincodeStub} stub
     * @param {Object} args
     * @return {void}
     */
    async delete (stub, args) {
        logger.debug('========= 删除键值对 ==========')
        let key = this.toKey(stub, args)
        let json = args
        logger.debug('key为： ' + key)
        await this.stub.deleteState(key) // 删除
        logger.debug(key + '的值已删除')
    }

    /**
     * @description: 组合键多个查询
     * @param {ChaincodeStub} stub
     * @param {Object} args
     * @return { [string] } 根据key获取到的value数组
     */
    async list (stub, args) {
        logger.debug('========= 获取key对应的多个value ==========')
        let json = args
        let cmpskey = this.toCompositeKey(json)
        let iter = await stub.getStateByPartialCompositeKey(cmpskey.objectType, cmpskey.attributes)
        return await this.toQueryResult(iter)
    }

    /**
     * @description: 获取组合键的前缀及属性
     * @param {Object} json
     * @return { Object } 包含组合键前缀及属性json对象
     */
    toCompositeKey (json) {
        let keys = Object.keys(json).sort() // 对键进行排序
        let objectType = ''
        let attributes = []
        for (var k of keys) {
            if (k == 'username') {
                objectType = json[k]
            } else {
                attributes.push(json[k])
            }
        }
        var jsonRet = {
            'objectType': objectType,
            'attributes': attributes
        }
        return jsonRet
    }

    /**
     * @description: 获取键/组合键
     * @param {ChaincodeStub} stub
     * @param {Object} args
     * @return { string } 键/组合键
     */
    toKey (stub, args) {
        let json = args
        let len = Object.keys(json).length
        let key = ''
        if (len == 0) {
            key = 'undefined'
        }
        if (len == 1) {
            key = Object.keys(json)[0]
        } else {
            let cmpskey = this.toCompositeKey(json)
            key = stub.createCompositeKey(cmpskey.objectType, cmpskey.attributes)
        }
        return key
    }

    /**
     * @description: 遍历迭代器，产生结果数组
     * @param {StateQueryIterator} iter
     * @return { [Object] } 包含多个键值对的json对象数组
     */
    async toQueryResult (iter) {
        let ret = []
        while (true) {
            let res = await iter.next()
            if (res.value && res.value.value.toString()) {
                let jsonRes = {}
                jsonRes.key = res.value.key
                try {
                    jsonRes.value = JSON.parse(res.value.value.toString())
                } catch (err) {
                    jsonRes.value = res.value.value.toString()
                }
                ret.push(jsonRes)
            }
            if (res.done) {
                await iter.close()
                return Buffer.from(JSON.stringify(ret))
            }
        }
    }
}
// 执行链码
shim.start(new Chaincode())