package io.mmtx.demo.rest;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import io.mmtx.demo.netty.ChannelMap;
import io.mmtx.demo.service.TestServerService;
import io.netty.channel.Channel;

@RestController
public class TestServerController {
	@Autowired
	private TestServerService testServerService;

	@GetMapping("/push/all/{msg}")
	public Boolean insertRow(@PathVariable("msg")String msg){
		Map<String,Channel> cs = ChannelMap.getAllChannel();
		for (String key : cs.keySet()) {
			Channel channel = cs.get(key);
			channel.writeAndFlush(msg);
			System.out.println("push id:"+key);
		}
		return true;
	}
}
