export const quotesList = [
  // { text: '', source: '' },
  { text: '学习25分钟，休息5分钟的番茄工作法有利于保持注意力集中呢', source: '酸' },
  { text: '一言也可以投稿哦，投稿邮箱shshouse@mikumod.com', source: '酸' },
  { text: '品味当下，笑一笑吧', source: '兽娘红茶馆' },
  { text: '幸福一旦退去，哀伤便一览无余', source: '兽娘红茶馆' },
  { text: '在这里，不存在由人类发明的匆忙，时间只会以它最古老的方式平和地流淌', source: '兽娘红茶馆' },

  { text: '醉云间，听雨眠', source: '' },
  { text: '寐雨稠謀声作曲，悠悠我心潇自在', source: '' },
  { text: '行客不知春欲尽，笑听流水数新舟', source: '' },
  { text: '杨柳岸，晓风残月', source: '' },
  { text: '可择一隅，静听碎玉', source: '' },

//   { text: '与其临渊羡鱼，不如退而结网', source: '《汉书》' },
//   { text: '学习是唯一一件，投入越多回报越确定的事情', source: '' },
//   { text: '在这个浮躁的世界里，沉下心来学习吧', source: '' },
//   { text: '你读过的书，走过的路，都会成为你的气质', source: '' },
//   { text: '梦想不会发光，发光的是追逐梦想的你', source: '' },
//   { text: '所有的横空出世，都是蓄谋已久', source: '' },
//   { text: '你若盛开，清风自来', source: '' },
//   { text: '学习是一场马拉松，不是百米冲刺', source: '' },
//   { text: '愿你以渺小启程，以伟大结束', source: '' },
]

export const getRandomQuote = () => {
  const index = Math.floor(Math.random() * quotesList.length)
  return quotesList[index]
}
