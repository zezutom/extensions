"use strict";
/*
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeUserFromList = exports.addUserToList = void 0;
const crypto = require("crypto");
const functions = require("firebase-functions");
// @ts-ignore incorrect typescript typings
const Mailchimp = require("mailchimp-api-v3");
const config_1 = require("./config");
const logs = require("./logs");
logs.init();
let mailchimp;
try {
    mailchimp = new Mailchimp(config_1.default.mailchimpApiKey);
}
catch (err) {
    logs.initError(err);
}
exports.addUserToList = functions.handler.auth.user.onCreate(async (user) => {
    logs.start();
    if (!mailchimp) {
        logs.mailchimpNotInitialized();
        return;
    }
    const { email, uid } = user;
    if (!email) {
        logs.userNoEmail();
        return;
    }
    try {
        logs.userAdding(uid, config_1.default.mailchimpAudienceId);
        const results = await mailchimp.post(`/lists/${config_1.default.mailchimpAudienceId}/members`, {
            email_address: email,
            status: config_1.default.mailchimpContactStatus,
        });
        logs.userAdded(uid, config_1.default.mailchimpAudienceId, results.id, config_1.default.mailchimpContactStatus);
        logs.complete();
    }
    catch (err) {
        logs.errorAddUser(err);
    }
});
exports.removeUserFromList = functions.handler.auth.user.onDelete(async (user) => {
    logs.start();
    if (!mailchimp) {
        logs.mailchimpNotInitialized();
        return;
    }
    const { email, uid } = user;
    if (!email) {
        logs.userNoEmail();
        return;
    }
    try {
        const hashed = crypto
            .createHash("md5")
            .update(email)
            .digest("hex");
        logs.userRemoving(uid, hashed, config_1.default.mailchimpAudienceId);
        await mailchimp.delete(`/lists/${config_1.default.mailchimpAudienceId}/members/${hashed}`);
        logs.userRemoved(uid, hashed, config_1.default.mailchimpAudienceId);
        logs.complete();
    }
    catch (err) {
        logs.errorRemoveUser(err);
    }
});
exports.updateMember = functions.handler.https
  .onCall(async (data, context) => {
      try {
        const firstName = data.firstName;
        const lastName = data.lastName;
        const email = data.email;
        const tag = data.tag;

        if (firstName && lastName && email) {
          const email = data.email;
          const hashed = crypto
            .createHash("md5")
            .update(email)
            .digest("hex");

          // Update first and last name
          await mailchimp.put(
            `/lists/${config_1.default.mailchimpAudienceId}/members/${hashed}`,
            {
              merge_fields: {
                FNAME: firstName,
                LNAME: lastName
              }
            }
          );

          if (tag) {
            // Insert the new tag
            let tags = [{ name: tag, status: 'active' }];

            const tagsRes = await mailchimp.get(
              `/lists/${config_1.default.mailchimpAudienceId}/members/${hashed}/tags`
            );

            if (tagsRes && tagsRes.tags) {
              // Mark any previous tags for deletion
              tagsRes.tags.forEach(tag => {
                if (tag.name !== tag) {
                  tags.push({ name: tag.name, status: 'inactive' });
                }
              });
            }

            // Tag the member
            await mailchimp.post(
              `/lists/${config_1.default.mailchimpAudienceId}/members/${hashed}/tags`,
              {
                tags: tags
              }
            );
          }

          logs.complete();
          return {
            success: true,
            data: {},
          }
        } else {
          logs.errorAddUserTags(new Error('Invalid input'));
          return {
            success: false,
            error: "Invalid input"
          };
        }
      } catch (err) {
        logs.errorAddUserTags(err);
        return {
          success: false,
          error: err.message
        };
      }
  });
