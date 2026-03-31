export const quotesList = [
  // { text: '', source: '' },
  { text: '学习25分钟，休息5分钟的番茄工作法有利于保持注意力集中呢', source: '松灰酸' },
  { text: '一言也可以投稿哦，投稿邮箱shshouse@mikumod.com', source: '松灰酸' },
  { text: '品味当下，笑一笑吧', source: '兽娘红茶馆' },
  { text: '幸福一旦退去，哀伤便一览无余', source: '兽娘红茶馆' },
  { text: '在这里，不存在由人类发明的匆忙，时间只会以它最古老的方式平和地流淌', source: '兽娘红茶馆' },

  { text: '醉云间，听雨眠', source: '' },//by 清辞慕染
  { text: '寐雨稠謀声作曲，悠悠我心潇自在', source: '' },//by 清辞慕染
  { text: '行客不知春欲尽，笑听流水数新舟', source: '' },//by 清辞慕染
  { text: '杨柳岸，晓风残月', source: '' },//by 清辞慕染
  { text: '可择一隅，静听碎玉', source: '' },//by 清辞慕染
  { text: '闲庭信步笑浮生，醉倚东篱邀月同欢', source: '' },//by 清辞慕染
  { text: '风引松涛谐古韵，神游云岫忘尘寰', source: '' },//by 清辞慕染
  { text: '少年听雨歌楼上，红烛昏罗帐', source: '' },//by 清辞慕染
  { text: '春风得意马蹄疾，一日看尽长安花', source: '' },//by 清辞慕染
  { text: '今人不见古时月，今月曾经照古人', source: '' },//by 清辞慕染
  { text: '古有长相难厮守，水兴华举湖揽舟', source: '' },//by 清辞慕染
  { text: '遇到难题了吗，不知道如何前进的话，先迈出第一步吧！', source: '原神' },//by Siada.
  { text: '我想要的是一种轻盈的生活，一种能被阳光穿透的生活', source: '弗吉尼亚·伍尔芙' },//by 十字斛科
  { text: '我可以告诉你当年我也一样郁闷吗？', source: '马晨/舒欢' },//by spring
  
  { text: '与其临渊羡鱼，不如退而结网', source: '《汉书》' },
  { text: '学习是唯一一件，投入越多回报越确定的事情', source: '' },
  { text: '在这个浮躁的世界里，沉下心来学习吧', source: '' },
  { text: '你读过的书，走过的路，都会成为你的气质', source: '' },
  { text: '梦想不会发光，发光的是追逐梦想的你', source: '' },
  { text: '所有的横空出世，都是蓄谋已久', source: '' },
  { text: '你若盛开，清风自来', source: '' },
  { text: '学习是一场马拉松，不是百米冲刺', source: '' },
  { text: '愿你以渺小启程，以伟大结束', source: '' },
]

export const getRandomQuote = () => {
  const index = Math.floor(Math.random() * quotesList.length)
  return quotesList[index]
}
