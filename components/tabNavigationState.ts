let lastTabIndex = 0;

export const getLastTabIndex = () => lastTabIndex;
export const setLastTabIndex = (i: number) => { lastTabIndex = i; };

export default { getLastTabIndex, setLastTabIndex };