const Joi = require('joi');
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
const PluginName = 'User'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const LayoutCheck = Joi.object({
    design: Joi.string().valid('light.fluid', 'dark.fluid', 'light.center', 'dark.center').required(),
});

const LanguageCheck = Joi.object({
    language: Joi.string().valid(...Object.keys(process.countryConfig)).required(),
});

const PasswordCheck = Joi.object({
    old_password: Joi.string().min(0).max(56).required(),
    new_password: Joi.string().min(6).max(56).required(),
});

// Make sure there are no illigal caracter in the username that can be exploited
const UsernameCheck = Joi.object({
    username: Joi.string().min(3).max(32).pattern(/^[a-zA-Z0-9_]*$/).required(),
});

const EmailCheck = Joi.object({
    email: Joi.string().email().required(),
});

const FirstNameCheck = Joi.object({
    first_name: Joi.string().min(2).max(32).pattern(/^[a-zA-Z0-9_]*$/).required(),
});

const LastNameCheck = Joi.object({
    last_name: Joi.string().min(2).max(32).pattern(/^[a-zA-Z0-9_]*$/).required(),
});

router.post('/layout', verifyRequest('web.user.layout.write'), limiter(10), async (req, res) => {
    const value = await LayoutCheck.validateAsync(await req.json());
    if (!value) throw new InvalidRouteInput('Invalid Route Input');

    const sql_response = await user.settings.updateDesign(req.user.user_id, value.design);
    if (sql_response.rowCount !== 1) throw new DBError('User.Settings.UpdateDesign', 1, typeof 1, sql_response.rowCount, typeof sql_response.rowCount);
    // Flush the cache
    await delWebtoken(req.authorization);

    res.status(200);
    res.json({
        message: 'Layout changed',
        design: value.design,
    });
});

router.post('/language', verifyRequest('web.user.language.write'), limiter(10), async (req, res) => {
    const value = await LanguageCheck.validateAsync(await req.json());
    if (!value) throw new InvalidRouteInput('Invalid Route Input');

    const sql_response = await user.settings.updateLanguage(req.user.user_id, value.language);
    if (sql_response.rowCount !== 1) throw new DBError('User.Settings.UpdateLanguage', 1, typeof 1, sql_response.rowCount, typeof sql_response.rowCount);
    // Flush the cache
    await delWebtoken(req.authorization);

    res.status(200);
    res.json({
        message: 'Language changed',
        language: value.language,
    });
});

router.post('/setpassword', verifyRequest('web.user.password.write'), limiter(10), async (req, res) => {
    const value = await PasswordCheck.validateAsync(await req.json());
    if (!value) throw new InvalidRouteInput('Invalid Route Input');

    const user_responses = await user.get(req.user.user_id)
    if (!user_responses || user_responses.length === 0) throw new InvalidLogin('Unknown User');
    const user_response = user_responses[0];

    if (user_response.password === null) { // <-- Check if user has a password, if not we skip this check (This can happen if the user used OAuth to register)
        const urlPath = generateUrlPath();
        await sendMail('user:reset_password', { userId: req.user.user_id, urlPath: urlPath, appDomain: process.env.DOMAIN }, false);
        throw new InvalidRouteInput('User has no password set yet').withStatus(409).withBackUrl('none')
    }

    const bcrypt_response = await bcrypt.compare(value.old_password, user_response.password);
    if (!bcrypt_response) throw new InvalidLogin('Old password is wrong');

    const bcrypt_new_password = await bcrypt.hash(value.new_password, 10);
    const sql_response = await user.update.password(req.user.user_id, bcrypt_new_password);
    if (sql_response.rowCount !== 1) throw new DBError('User.Update.Password', 1, typeof 1, sql_response.rowCount, typeof sql_response.rowCount);

    res.status(200);
    res.json({
        message: 'Password changed',
    });
});

router.get('/', verifyRequest('web.user.settings.read'), limiter(2), async (req, res) => {
    const user_responses = await user.get(req.user.user_id);
    if (!user_responses || user_responses.length === 0) throw new InvalidRouteInput('Unknown User');

    const user_response = user_responses[0];

    res.status(200);
    res.json({
        username: user_response.username,
        email: user_response.email,
        first_name: user_response.first_name,
        last_name: user_response.last_name,
        bio: user_response.bio,
        public: user_response.public,
    });
});

router.get('/credit', verifyRequest('web.user.credit.read'), limiter(2), async (req, res) => {
    const user_responses = await user.get(req.user.user_id);
    if (!user_responses || user_responses.length === 0) throw new InvalidRouteInput('Unknown User');

    const user_response = user_responses[0];

    res.status(200);
    res.json({
        credit: user_response.credit,
    });
});

router.post('/username', verifyRequest('web.user.username.write'), limiter(10), async (req, res) => {
    const value = await UsernameCheck.validateAsync(await req.json());
    if (!value) throw new InvalidRouteInput('Invalid Route Input');

    const sql_response = await user.update.username(req.user.user_id, value.username);
    if (sql_response.rowCount !== 1) throw new DBError('User.Update.Username', 1, typeof 1, sql_response.rowCount, typeof sql_response.rowCount);
    // Flush the cache
    await delWebtoken(req.authorization);

    res.status(200);
    res.json({
        message: 'Username changed',
        username: value.username,
    });
});

router.post('/email', verifyRequest('web.user.email.write'), limiter(10), async (req, res) => {
    const value = await EmailCheck.validateAsync(await req.json());
    if (!value) throw new InvalidRouteInput('Invalid Route Input');

    const sql_response = await user.update.email(req.user.user_id, value.email);
    if (sql_response.rowCount !== 1) throw new DBError('User.Update.Email', 1, typeof 1, sql_response.rowCount, typeof sql_response.rowCount);

    res.status(200);
    res.json({
        message: 'Email changed',
        email: value.email,
    });
});

router.post('/firstname', verifyRequest('web.user.firstname.write'), limiter(10), async (req, res) => {
    const value = await FirstNameCheck.validateAsync(await req.json());
    if (!value) throw new InvalidRouteInput('Invalid Route Input');

    const sql_response = await user.update.first_name(req.user.user_id, value.first_name);
    if (sql_response.rowCount !== 1) throw new DBError('User.Update.FirstName', 1, typeof 1, sql_response.rowCount, typeof sql_response.rowCount);

    res.status(200);
    res.json({
        message: 'First name changed',
        first_name: value.first_name,
    });
});

router.post('/lastname', verifyRequest('web.user.lastname.write'), limiter(10), async (req, res) => {
    const value = await LastNameCheck.validateAsync(await req.json());
    if (!value) throw new InvalidRouteInput('Invalid Route Input');

    const sql_response = await user.update.last_name(req.user.user_id, value.last_name);
    if (sql_response.rowCount !== 1) throw new DBError('User.Update.LastName', 1, typeof 1, sql_response.rowCount, typeof sql_response.rowCount);

    res.status(200);
    res.json({
        message: 'Last name changed',
        last_name: value.last_name,
    });
});

router.delete('/avatar', verifyRequest('web.user.avatar.write'), limiter(10), async (req, res) => {
    const sql_response = await user.update.avatar(req.user.user_id, null);
    if (sql_response.rowCount !== 1) throw new DBError('User.Update.Avatar', 1, typeof 1, sql_response.rowCount, typeof sql_response.rowCount);

    res.status(200);
    res.json({
        message: 'Avatar deleted',
    });
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};