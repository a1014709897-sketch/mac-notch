'use strict';
function updateDialogOptions(update, current) {
  return {
    type: 'info', title: 'Mac Notch 有新版本',
    message: `Mac Notch v${update.version} 已发布`,
    detail: `${update.notes?.trim() || '包含体验改进与问题修复。'}\n\n当前版本 v${current}。下载完成后，请退出旧版、将新应用替换到原位置，再重新打开。`,
    buttons: ['下载更新', '稍后提醒', '跳过此版本'], defaultId: 0, cancelId: 1,
    noLink: true,
  };
}
module.exports = { updateDialogOptions };
