const Joi = require('@lib/sanitizer');
const { user } = require('@lib/postgres');
const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { delWebtoken } = require('@lib/cache');
const { sendMail } = require('@lib/queues');
const { generateUrlPath } = require('@lib/utils');
const HyperExpress = require('hyper-express');
const bcrypt = require('bcrypt');
const { InvalidRouteInput, DBError, InvalidLogin } = require('@lib/errors');
const router = new HyperExpress.Router();

/* Plugin info*/
const PluginName = 'Admin User Managment'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const userListQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).default(10),
    sort: Joi.string().valid('username', 'user_group', 'email', 'first_name', 'last_name', 'credit').default('first_name'),
    order: Joi.string().valid('asc', 'desc').default('asc'),
    search: Joi.fullysanitizedString().allow('').default(''),
});

const userIdSchema = Joi.object({
    id: Joi.number().integer().min(1).required()
});

const userCreditSchema = Joi.object({
    credit: Joi.number().integer().min(0).required()
});

router.get('/', verifyRequest('web.admin.users.read'), limiter(1), async (req, res) => {
    const { page, limit, sort, order, search } = await userListQuerySchema.validateAsync(req.query);
    const offset = (page - 1) * limit;

    const sql_response = await user.admin.listUsers(offset, limit, sort, order, search);
    if (!sql_response) throw new DBError('User.Admin.ListUsers', 1, typeof 1, sql_response, typeof sql_response);

    res.status(200);
    res.json(sql_response);
});

router.post(':id/setCredit', verifyRequest('web.admin.credit.write'), limiter(1), async (req, res) => {
    const { id } = await userIdSchema.validateAsync(req.params);
    const { credit } = await userCreditSchema.validateAsync(await req.json());

    const sql_response = await user.admin.setCredit(id, credit);
    if (!sql_response) throw new DBError('User.Admin.SetCredit', 1, typeof 1, sql_response, typeof sql_response);

    res.status(200);
    res.json({ message: 'Credit set' });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};