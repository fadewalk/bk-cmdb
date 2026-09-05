// 为 CMDB 创建业务账号(在 mongo 首次初始化、未开启认证前执行)
db = db.getSiblingDB("cmdb");
db.createUser({
    user: "cmdb",
    pwd: "cmdb1234",
    roles: [
        { role: "readWrite", db: "cmdb" },
        { role: "dbAdmin", db: "cmdb" }
    ]
});
