FROM citrixg11n/radar:20.7.2

ADD dist/index.js /

CMD [ "node", "/index.js" ]